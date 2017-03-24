import * as url from 'url'
import RecordServer from '../src/main'

let server = new RecordServer().listen(22009)
let kcsapiObserval = server.requestFilter((pack) => {
    return url.parse(pack.req.url).pathname.startsWith('/kcsapi')
})

let useitemStore = kcsapiObserval
    .filter((pack) => {
        return url.parse(pack.req.url).pathname === '/kcsapi/api_get_member/useitem'
    })
    .converter((pack) => {
        let json: string = pack.resBody.toString().slice(7)
        return JSON.parse(json)
    })
    .toStore({ maxCount: 50 })

useitemStore.subscribe((jsondata) => {
    console.log(jsondata.api_result_msg)
})