import * as http from 'http'
import * as url from 'url'
import * as EventEmitter from 'events'
import * as zlib from 'zlib'
import * as net from 'net'
import { Buffer } from 'buffer'

import * as setup from '../library/proxy'

import { 
    IPack,
    IResponsePack,
    IRecoredSource,
    IProxyServer, 
    IRecordStore,
    IRecordSubscriber,
    IProxyOption
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
let buildNewPack = <T extends IPack> (oldPack?: T): T => {
    let newPack: T = {} as T
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
    private subscribers: Set<RecordSubscriber<IResponsePack>>
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
    filter (filter: (pack: IResponsePack) => boolean): Filter<IResponsePack> {
        return new Filter<IResponsePack>(this, filter)
    }
    converter<toT> (convert: (pack: IResponsePack) => toT): Converter<IResponsePack, toT> {
        return new Converter(this, convert)
    }

    
    subscribe (fn: (pack: IResponsePack) => void): RecordSubscriber<IResponsePack> {
        let unsubscribe = (subscriber: RecordSubscriber<IResponsePack>) => {
            this.subscribers.delete(subscriber)
        }

        let subscriber = new RecordSubscriber<IResponsePack>(fn, unsubscribe)
        this.subscribers.add(subscriber)
        return subscriber
    }
    subscribeToStore (size?: number): RecordStore<IResponsePack> {
        let closure = (fn: (_pack: IResponsePack) => void) => {
            return this.subscribe((pack) => {
                fn(pack)
            })
        }
        return new RecordStore(closure, size)
    }
}

abstract class RecordObservable<T extends IPack> implements IRecoredSource<T> {
    get level(): number  { return this.source.level + 1; }
    filter (filter: (pack: T) => boolean): Filter<T> {
        return new Filter<T>(this, filter)
    }
    converter<toT> (convert: (pack: T) => toT): Converter<T, toT> {
        return new Converter(this, convert)
    }
    subscribeToStore (size?: number): IRecordStore<T> {
        let closure = (fn: (_pack: T) => void) => {
            return this.subscribe((pack) => {
                fn(pack)
            })
        }
        return new RecordStore(closure, size)
    }

    protected source: IRecoredSource<IPack>
    protected closure: (fn: Function) => ((pack: IPack) => void)
    constructor (source: IRecoredSource<IPack>) {
        this.source = source
    }
    subscribe (fn: (pack: T) => void): IRecordSubscriber<T> {
        return this.source.subscribe(this.closure(fn))
    }
}

class Filter<T extends IPack> extends RecordObservable<T> {
    constructor (source: IRecoredSource<T>, filter: (pack: T) => boolean) {
        super(source)
        this.closure = (fn: (pack: T) => void) => {
            return (pack: T) => {
                if (filter(pack)) {
                    fn(buildNewPack(pack))
                }
            }
        }
    }
}
class Converter<fromT extends IPack, toT extends IPack> extends RecordObservable<toT> {
    protected source: IRecoredSource<fromT>
    constructor (source: IRecoredSource<fromT>, convert: (pack: fromT) => toT) {
        super(source)
        this.closure = (fn) => { 
            return (pack: fromT) => {
                fn(convert(buildNewPack(pack)))
            }
        }
    }
}

class RecordStore<T> implements IRecordStore<T> {
    private subscriber: IRecordSubscriber<T>
    private maxSize: number
    private records: T[]

    constructor(closure: (fn: (_pack: T) => void) => IRecordSubscriber<T>, size?: number) {
        this.subscriber = closure((pack) => this.pushRecord(pack))
        this.maxSize = size || 10
        this.records = []
    }
    private pushRecord (pack: T): void {
        if (this.records.length >= this.maxSize) {
            this.records.shift()
        }
        this.records.push(pack)
    }

    get current (): T {
        return this.records.length > 0 ? this.records[this.records.length - 1] : null
    }
    get size (): number {
        return this.records.length
    }
    clear (): void {
        this.records.length = 0
    }
    select (filter?: (pack:T, index: number) => boolean): T[] {
        return filter ? this.records.filter(filter) : this.records.map(e => e)
    }

    destroy (): void {
        this.subscriber.unsubscribe()
        this.records.length = 0
    }
}

class RecordSubscriber<T> implements IRecordSubscriber<T> {
    private source: IRecoredSource<T>
    private _close: boolean = false
    private _next: Function
    private _unsubscribe: () => void
    constructor (next: Function, unsubscribe: (subscriber: IRecordSubscriber<T>) => void) {
        this._next = next
        this._unsubscribe = () => { unsubscribe(this) }
    }
    next (arg: T): void {
        this._next(arg)
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