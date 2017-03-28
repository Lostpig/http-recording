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
    IRecordStore,
    IRecordSubscriber,
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
let getData = async (proxyReq: http.ClientRequest, req: http.IncomingMessage) => {
    return new Promise<{proxyRes: http.IncomingMessage, reqBody: Buffer, resBody: Buffer}>((resolve, rejuct) => {
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
                resolve({proxyRes, reqBody: reqBuffer, resBody: resBuffer })
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
    get level(): number  { return 0 }
    private server: setup.ProxyServer
    constructor (options?: IProxyOption) {
        this.subscribers = new Set()

        this.server = setup(null, {
            target: options && options.target || null
        })
        this.server.on('proxyReq', async (proxyReq, req, res) => {
            let { proxyRes, reqBody, resBody } = await getData(proxyReq, req)
            this.subscribers.forEach(subscriber => subscriber.next({ req, proxyRes, reqBody, resBody }))
        })
    }
    listen (port: number, host?: string): this {
        this.server.listen(port, host)
        return this
    }
    filter (filter: (pack: IResponsePack) => boolean): Filter {
        return new Filter(this, { filter })
    }
    converter (convert: (pack: IResponsePack) => any): Converter {
        return new Converter(this, { convert })
    }

    private subscribers: Set<RecordSubscriber>
    subscribe (fn: (pack: IResponsePack) => void): RecordSubscriber {
        let subscriber: RecordSubscriber
        let next = (pack: IResponsePack) => {
            fn(pack)
        }
        let unsubscribe = () => {
            this.subscribers.delete(subscriber)
        }

        subscriber = new RecordSubscriber(next, unsubscribe)
        this.subscribers.add(subscriber)
        return subscriber
    }
    subscribeToStore (options?: IStoreOptions): RecordStore {
        let closure = (fn: (_pack: any) => void) => {
            return this.subscribe((pack) => {
                fn(pack)
            })
        }
        return new RecordStore(closure, options)
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
    subscribeToStore (options?: IStoreOptions): IRecordStore {
        let closure = (fn: (_pack: any) => void) => {
            return this.subscribe((pack) => {
                fn(pack)
            })
        }
        return new RecordStore(closure, options)
    }

    protected source: IRecoredSource
    protected closure: (fn: Function) => ((pack: any) => void)
    constructor (source: IRecoredSource) {
        this.source = source
    }
    subscribe (fn: (pack: any) => void): IRecordSubscriber {
        return this.source.subscribe(this.closure(fn))
    }
}

class Filter extends RecordObservable {
    constructor (source: IRecoredSource, options: IFilterOption) {
        super(source)
        this.closure = (fn) => { 
            return (pack) => {
                if (options.filter(pack)) {
                    fn(buildNewPack(pack))
                }
            }
        }
    }
}
class Converter extends RecordObservable {
    constructor (source: IRecoredSource, options: IConverterOption) {
        super(source)
        this.closure = (fn) => { 
            return (pack) => {
                fn(options.convert(buildNewPack(pack)))
            }
        }
    }
}

class RecordStore implements IRecordStore {
    private subscriber: IRecordSubscriber
    private maxCount: number
    private records: any[]

    constructor(closure: (fn: (_pack: any) => void) => IRecordSubscriber, options?: IStoreOptions) {
        options = options || { maxCount: 10 }

        this.subscriber = closure((pack) => this.pushRecord(pack))
        this.maxCount = options.maxCount
        this.records = []
    }
    private pushRecord (pack: any): void {
        if (this.records.length >= this.maxCount) {
            this.records.shift()
        }
        this.records.push(pack)
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
        this.subscriber.unsubscribe()
        this.records.length = 0
    }
}

class RecordSubscriber implements IRecordSubscriber {
    private source: IRecoredSource
    private _close: boolean = false
    private _next: Function
    private _unsubscribe: () => void
    constructor (next: Function, unsubscribe: () => void) {
        this._next = next
        this._unsubscribe = unsubscribe
    }
    next (...args: any[]): void {
        this._next(...args)
    }
    get close (): boolean {
        return this._close
    }
    unsubscribe (): void {
        this._unsubscribe()
        this._close = true
    }
}

export default ProxyServer