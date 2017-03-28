import * as url from 'url'
import { RecordServer } from '../'

let server = new RecordServer().listen(22009)

let kcsapiObserval = server.filter((pack) => {
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
    .subscribeToStore({ maxCount: 100 })

let subscriber = kcsapiObserval.subscribe((jsondata) => {
    console.log(jsondata.api_result_msg)
})

setTimeout(() => {
    subscriber.unsubscribe()
    console.log(`total records count in last 30s: ${useitemStore.size}`)

    console.log('unsubscribed')
}, 30000)
