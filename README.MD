# http-recording
一个简单的http请求代理记录服务器库

基于[proxy](https://github.com/TooTallNate/proxy)
对原版proxy做了一些小修改[proxy修改版](https://github.com/Lostpig/proxy)

example
``` js
const RecordServer = require('http-recording');

let server = new RecordServer().listen(22009)
let kcsapiObserval = server
    .filter((pack) => {
        return url.parse(pack.req.url).pathname.startsWith('/kcsapi')
    })
    .converter((pack) => {
        let json = pack.resBody.toString().slice(7)
        return JSON.parse(json)
    })

let kcsapiStore = kcsapiObserval.subscribeToStore()
let kcsapiSubscriber = kcsapiObserval.subscribe((json) => {
    console.log(json)
})
```
