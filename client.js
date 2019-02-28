'use strict'

const r = require('ramda')
const http2 = require('http2')
const { promisify } = require('util')

const {
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_SCHEME,
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_AUTHORITY,
    HTTP2_HEADER_PATH,
    HTTP2_METHOD_POST
} = http2.constants

class Client {
    constructor(uri, logger = console) {
        this.uri = uri
        this.logger = logger
        this.createSession()
    }

    ping() {
        if (!this.isValid()) {
            return
        }

        this.session.ping((error, duration) => {
            if (!r.isNil(error)) {
                this.logger.silly('No ping response after ' + duration + 'ms')
            }
            this.logger.silly('Ping response after ' + duration + 'ms')
        })
    }

    isValid() {
        return !r.isNil(this.session) && !this.session.destroyed
    }

    createSession() {
        if (this.isValid()) {
            return
        }

        this.session = http2.connect(this.uri, {})
        this.session
            .on('socketError', e => {
                this.logger.error('Socket error', e)
                this.destroy()
            })
            .on('error', e => {
                this.logger.error('Client error', e)
                this.destroy()
            })

        this.session
            .on('connect', () => {
                this.logger.silly('Session connected', this.uri)
            })
            .on('close', () => {
                this.logger.silly('Session close', this.uri)
            })
            .on('frameError', (frameType, errorCode, streamId) => {
                this.logger.silly(
                    `Session Frame error: (frameType: ${frameType}, errorCode ${errorCode}, streamId: ${streamId}), for ${
                        this.uri
                    }`
                )
            })
            .on('goaway', (errorCode, lastStreamId, opaqueData) => {
                this.logger.silly(
                    `Session GOAWAY received: (errorCode ${errorCode}, lastStreamId: ${lastStreamId}, opaqueData: ${opaqueData}), for ${
                        this.uri
                    }`
                )
                // gracefully stop accepting new streams
                this.shutdown()
            })

        this.interval = setInterval(this.ping.bind(this), 60000).unref()
    }

    write(msg) {
        this.createSession()

        let statusCode
        let responseData = ''

        const headers = {
            [HTTP2_HEADER_METHOD]: HTTP2_METHOD_POST
        }
        const request = this.session.request(headers)
        request.setEncoding('utf8')

        request
            .on('response', headers => {
                statusCode = headers[HTTP2_HEADER_STATUS]
            })
            .on('data', data => {
                responseData += data
            })

        request.write(msg)

        return new Promise((resolve, reject) => {
            request.on('end', () => {
                if (statusCode === 200) {
                    let res
                    try {
                        res = JSON.parse(responseData)
                    } catch (error) {
                        res = responseData
                    }
                    resolve(res)
                } else if (responseData !== '') {
                    try {
                        const response = JSON.parse(responseData)
                        return reject(response)
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    reject({ code: statusCode })
                }

                request.on('error', error => {
                    this.logger.error(`Request error: ${error}`)
                    reject(error)
                })
            })

            request.end()
        })
    }

    destroy() {
        if (this.isValid()) {
            this.session.destroy()
        }
    }

    shutdown() {
        if (!this.isValid()) {
            return Promise.reject(new Error('Invalid session'))
        }
        if (!r.isNil(this.interval)) {
            clearInterval(this.interval)
        }
        const gracefulShutdown = promisify(this.session.close)
        return gracefulShutdown({ graceful: true }).then(() =>
            this.session.destroy()
        )
    }
}

module.exports = Client
