import * as http from 'http'
import * as url from 'url'
import * as EventEmitter from 'events'
import * as zlib from 'zlib'
import * as net from 'net'
import { Buffer } from 'buffer'

import * as setup from '../library/proxy'

import { 
    IRequestPack, 
    IResponsePack,
    IRecoredSource,
    IProxyServer, 
    IRequestFilter,
    IRecordStore,
    IProxyOption,
    IFilterOption,
    IConverterOption,
    IStoreOptions
 } from './interface'

let uncompress = async (data: Buffer, encoding: string): Promise<Buffer> => {
    return new Promise<Buffer>((resolve, reject) => {
        if(encoding === 'gzip') {
            zlib.gunzip(data, (err, result) => {
                if (err) { reject(err); }
                else { resolve(result); }
            });
        }
        else if(encoding === 'deflate') {
            zlib.inflate(data, (err, result) => {
                if (err) { reject(err); }
                else { resolve(result); }
            });
        }
        else {
            resolve(data)
        }
    })
}
let getData = async (proxyReq: http.ClientRequest, req: http.IncomingMessage): Promise<[Buffer]> => {
    return new Promise<[Buffer]>((resolve, rejuct) => {
        let reqBuffer = new Buffer(0),
            resBuffer = new Buffer(0)
        req.on('data', (chunk: Buffer) => {
            reqBuffer = Buffer.concat([reqBuffer, chunk]);
        }).on('end', (remoteRes: http.ServerResponse) => {
            //nothing
        })

        proxyReq.on('response', (proxyRes: http.IncomingMessage) => {
            proxyRes.on('data', (chunk: Buffer) => {
                resBuffer = Buffer.concat([resBuffer, chunk]);
            }).on('end', async () => {
                resBuffer = await uncompress(resBuffer, proxyRes.headers['content-encoding'])
                resolve([reqBuffer, resBuffer])
            })
        })
    })
}
let buildNewPack = (oldPack?: any): any => {
    let newPack: any = {}
    if (oldPack) {
        Object.keys(oldPack).forEach(key => {
            newPack[key] = oldPack[key]
        })
    }
    return newPack
}

class ProxyServer implements IProxyServer {
    get level(): number  { return 0; }
    private server: setup.ProxyServer
    constructor (options?: IProxyOption) {
        this.subscriber = new Set()
        this.requestSubscriber = new Set()

        this.server = setup(null, {
            target: options && options.target || null
        })
        this.server.on('proxyReq', (proxyReq, req, res) => {
            let reqFilterSubscribers = new Array<Function>(0)
            if (this.requestSubscriber.size > 0) {
                this.requestSubscriber.forEach((fn) => {
                    let doNext = fn({
                        req: req
                    })
                    if (doNext !== false) {
                        reqFilterSubscribers.push(doNext)
                    }
                })
            }
            if (reqFilterSubscribers.length > 0 || this.subscriber.size > 0) {
                getData(proxyReq, req).then((buffers) => {
                    let timestamp = Date.now(),
                        path = 0,
                        reqBody = buffers[0],
                        resBody = buffers[1]

                    this.subscriber.forEach(fn => fn({ req, reqBody, resBody }))
                    while (reqFilterSubscribers.length > 0) {
                        reqFilterSubscribers.pop()({ timestamp, path, reqBody, resBody })
                    }
                })
            }
        })
    }
    listen (port: number, host?: string): this {
        this.server.listen(port, host)
        return this
    }
    requestFilter (filter: (pack: IRequestPack) => boolean): IRequestFilter {
        return new RequestFilter(this, { filter: filter })
    }
    filter (filter: (pack: IResponsePack) => boolean): Filter {
        return new Filter(this, { filter })
    }
    converter (convert: (pack: IResponsePack) => any): Converter {
        return new Converter(this, { convert })
    }
    toStore (options?: IStoreOptions): RecordStore {
        return new RecordStore(this, options)
    }

    private subscriber: Set<(pack: IResponsePack) => void>
    private requestSubscriber: Set<(pack: IRequestPack) => ((pack: IResponsePack) => void) | false>
    subscribe (fn: (pack: IResponsePack) => void): boolean {
        let isAdded = this.subscriber.has(fn)
        if (!isAdded) {
            this.subscriber.add(fn)
        }
        return !isAdded
    }
    unsubscribe (fn?: (pack: IResponsePack) => void): boolean {
        let isDelete: boolean
        if (!fn) {
            isDelete = this.subscriber.size > 0
            this.subscriber.clear()
        } else {
            isDelete = this.subscriber.delete(fn)
        } 
        return isDelete
    }
    subscribeRequestFilter (fn: (pack: IRequestPack) => ((pack: IResponsePack) => void) | false): boolean {
        let isAdded = this.requestSubscriber.has(fn)
        if (!isAdded) {
            this.requestSubscriber.add(fn)
        }
        return !isAdded
    }
    unsubscribeRequestFilter (fn?: (pack: IRequestPack) => ((pack: IResponsePack) => void) | false): boolean {
        let isDelete: boolean
        if (!fn) {
            isDelete = this.requestSubscriber.size > 0
            this.requestSubscriber.clear()
        } else {
            isDelete = this.requestSubscriber.delete(fn)
        } 
        return isDelete
    }
}

abstract class RecordObservable implements IRecoredSource {
    get level(): number  { return this.source.level + 1; }
    filter (filter: (pack: any) => boolean): Filter {
        return new Filter(this, { filter })
    }
    converter (convert: (pack: any) => any): Converter {
        return new Converter(this, { convert })
    }
    toStore (options?: IStoreOptions): IRecordStore {
        return new RecordStore(this, options)
    }

    protected source: IRecoredSource
    protected excute: (pack: any) => void
    protected subscriber: Set<(pack:any) => void>
    constructor (source: IRecoredSource) {
        this.source = source
        this.subscriber = new Set();
    }

    subscribe (fn: (pack: any) => void): boolean {
        let isAdded = this.subscriber.has(fn)
        if (!isAdded) {
            this.subscriber.add(fn)
        }
        this.source.subscribe(this.excute)

        return !isAdded
    }
    unsubscribe (fn?: (pack: any) => void): boolean {
        let isDelete: boolean
        if (!fn) {
            isDelete = this.subscriber.size > 0
            this.subscriber.clear()
            this.source.unsubscribe(this.excute)
        } else {
            isDelete = this.subscriber.delete(fn)
            if (this.subscriber.size === 0) {
                this.source.unsubscribe(this.excute)
            }
        }

        return isDelete
    }
}

class RequestFilter extends RecordObservable implements IRequestFilter {
    protected source: ProxyServer
    protected excute: (pack: IRequestPack) => ((pack: IResponsePack) => void) | false
    constructor (source: ProxyServer, options: IFilterOption) {
        super(source)
        this.subscriber = new Set();
        this.excute = (reqPack: IRequestPack) => {
            return options.filter(reqPack) ? 
                (pack: IResponsePack) => { 
                    this.subscriber.forEach(fn => fn(pack))
                } : false
        }
    }

    subscribe (fn: (pack: IRequestPack) => void): boolean {
        let isAdded = this.subscriber.has(fn)
        if (!isAdded) {
            this.subscriber.add(fn)
        }

        this.source.subscribeRequestFilter(this.excute)
        return !isAdded
    }
    unsubscribe (fn?: (pack: IRequestPack) => void): boolean {
        let isDelete: boolean
        if (!fn) {
            isDelete = this.subscriber.size > 0
            this.subscriber.clear()
            this.source.unsubscribeRequestFilter(this.excute)
        } else {
            isDelete = this.subscriber.delete(fn)
            if (this.subscriber.size === 0) {
                this.source.unsubscribeRequestFilter(this.excute)
            }
        }

        return isDelete
    }
}

class Filter extends RecordObservable {
    protected excute: (pack: any) => void
    constructor (source: IRecoredSource, options: IFilterOption) {
        super(source)
        this.excute = (pack) => { 
            if (options.filter(pack)) {
                this.subscriber.forEach((fn) => {
                    fn(buildNewPack(pack))
                })
            }
        }
    }
}

class Converter extends RecordObservable {
    protected excute: (pack: any) => void
    constructor (source: IRecoredSource, options: IConverterOption) {
        super(source)
        this.excute = (pack) => { 
            this.subscriber.forEach((fn) => {
                fn(options.convert(buildNewPack(pack)))
            })
        }
    }
}

class RecordStore implements IRecordStore {
    private source: IRecoredSource
    private maxCount: number
    private subscriber: Set<(pack:any) => void>
    private records: any[]
    private excute: (pack: any) => void
    constructor(source: IRecoredSource, options?: IStoreOptions) {
        options = options || { maxCount: 10 }

        this.source = source
        this.subscriber = new Set();
        this.maxCount = options.maxCount
        this.records = []

        this.excute = (pack) => {
            this.pushRecord(pack)
            this.subscriber.forEach(fn => fn(pack))
        }
        this.source.subscribe(this.excute)
    }
    private pushRecord (pack: any): void {
        if (this.records.length >= this.maxCount) {
            this.records.shift()
        }
        this.records.push(pack)
    }
    subscribe (fn: (pack: any) => void): boolean {
        let isAdded = this.subscriber.has(fn)
        if (!isAdded) {
            this.subscriber.add(fn)
        }

        return !isAdded
    }
    unsubscribe (fn?: (pack: any) => void): boolean {
        let isDelete: boolean
        if (!fn) {
            isDelete = this.subscriber.size > 0
            this.subscriber.clear()
        } else {
            isDelete = this.subscriber.delete(fn)
        }

        return isDelete
    }

    get current (): any {
        return this.records.length > 0 ? this.records[this.records.length - 1] : null
    }
    get size (): number {
        return this.records.length
    }
    clear (): void {
        this.records.length = 0
    }
    select (filter?: (pack:any, index: number) => boolean): any[] {
        return filter ? this.records.filter(filter) : this.records.map(e => e)
    }

    destroy (): void {
        this.unsubscribe()
        this.source.unsubscribe(this.excute)
        this.records.length = 0
    }
}

export default ProxyServer