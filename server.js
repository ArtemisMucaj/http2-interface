'use strict'

const r = require('ramda')
const http2 = require('http2')

let Server

module.exports = (port, fn) => {
    if (r.isNil(Server)) {
        Server = http2.createServer()
    }
    Server.on('stream', (stream, headers) => {
        let buffers = []
        let responseData
        stream
            .on('error', error => {
                if (r.is(Function, fn)) {
                    fn(error, null)
                }
                stream.respond({
                    'content-type': 'application/json',
                    ':status': 400
                })
                return stream.end()
            })
            .on('data', data => {
                buffers.push(data)
            })
            .on('end', () => {
                responseData = Buffer.concat(buffers)
                // Application code must end the stream
                if (r.is(Function, fn)) {
                    fn(null, responseData, stream)
                }
            })

        stream.respond({
            'content-type': 'application/json',
            ':status': 200
        })
    })
    Server.listen(port)
    return Server
}
