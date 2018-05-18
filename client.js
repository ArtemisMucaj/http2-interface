'use strict'

const r = require('ramda')
const http2 = require('http2')

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
        this.__uri = uri
        this.__http2Client
        this.__logger = logger
    }

    get logger() {
        return this.__logger
    }

    write(msg) {
        if (r.isNil(this.__http2Client) || this.__http2Client.destroyed) {
            this.__http2Client = http2.connect(this.__uri, {})
            this.__http2Client
                .on('socketError', e => {
                    this.logger.error('Socket error', e)
                    if (
                        !r.isNil(this.__http2Client) &&
                        !this.__http2Client.destroyed
                    ) {
                        this.__http2Client.destroy()
                    }
                })
                .on('error', e => {
                    this.logger.error('Client error', e)
                    if (
                        !r.isNil(this.__http2Client) &&
                        !this.__http2Client.destroyed
                    ) {
                        this.__http2Client.destroy()
                    }
                })

            this.__http2Client
                .on('connect', () => {
                    this.logger.silly('Http2Client connected', this.__uri)
                })
                .on('close', () => {
                    this.logger.silly('Http2Client close', this.__uri)
                })
                .on('frameError', (frameType, errorCode, streamId) => {
                    this.logger.silly(
                        `Http2Client Frame error: (frameType: ${frameType}, errorCode ${errorCode}, streamId: ${streamId}), for ${this.__uri}`
                    )
                })
                .on('goaway', (errorCode, lastStreamId, opaqueData) => {
                    this.logger.silly(
                        `Http2Client GOAWAY received: (errorCode ${errorCode}, lastStreamId: ${lastStreamId}, opaqueData: ${opaqueData}), for ${this.__uri}`
                    )
                })
        }

        let statusCode
        let responseData = ''

        const headers = {
            [HTTP2_HEADER_METHOD]: HTTP2_METHOD_POST
        }
        const request = this.__http2Client.request(headers)
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
        if (!r.isNil(this.__http2Client) && !this.__http2Client.destroyed) {
            this.__http2Client.destroy()
        }
    }
}

module.exports = Client
