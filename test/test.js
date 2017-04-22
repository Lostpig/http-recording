const url = require('url')
const RecordServer = require('../').default

let server = new RecordServer().listen(22009)

let useItemObserval = server.filter((pack) => {
        return url.parse(pack.req.url).pathname === '/kcsapi/api_get_member/useitem'
    })
    .converter((pack) => {
        let json = pack.resBody.toString().slice(7)
        return JSON.parse(json)
    })

let useitemStore = useItemObserval.subscribeToStore(100)
let subscriber = useItemObserval.subscribe((json) => {
    console.log(json.api_result_msg)
})
