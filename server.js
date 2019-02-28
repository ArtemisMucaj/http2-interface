'use strict'

const r = require('ramda')
const http2 = require('http2')

module.exports = (port, options, fn) => {
    const server = http2.createServer()
    server.on('stream', (stream, headers) => {
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

        if (r.propOr(true, 'respond', options)) {
            stream.respond({
                'content-type': 'application/json',
                ':status': 200
            })
        }
    })

    server.listen(port)
    return server
}
