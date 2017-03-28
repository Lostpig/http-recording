"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const zlib = require("zlib");
const buffer_1 = require("buffer");
const setup = require("../library/proxy");
let uncompress = (data, encoding) => __awaiter(this, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        if (encoding === 'gzip') {
            zlib.gunzip(data, (err, result) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            });
        }
        else if (encoding === 'deflate') {
            zlib.inflate(data, (err, result) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            });
        }
        else {
            resolve(data);
        }
    });
});
let getData = (proxyReq, req) => __awaiter(this, void 0, void 0, function* () {
    return new Promise((resolve, rejuct) => {
        let reqBuffer = new buffer_1.Buffer(0), resBuffer = new buffer_1.Buffer(0);
        req.on('data', (chunk) => {
            reqBuffer = buffer_1.Buffer.concat([reqBuffer, chunk]);
        }).on('end', (remoteRes) => {
            //nothing
        });
        proxyReq.on('response', (proxyRes) => {
            proxyRes.on('data', (chunk) => {
                resBuffer = buffer_1.Buffer.concat([resBuffer, chunk]);
            }).on('end', () => __awaiter(this, void 0, void 0, function* () {
                resBuffer = yield uncompress(resBuffer, proxyRes.headers['content-encoding']);
                resolve({ proxyRes, reqBody: reqBuffer, resBody: resBuffer });
            }));
        });
    });
});
let buildNewPack = (oldPack) => {
    let newPack = {};
    if (oldPack) {
        Object.keys(oldPack).forEach(key => {
            newPack[key] = oldPack[key];
        });
    }
    return newPack;
};
class ProxyServer {
    get level() { return 0; }
    constructor(options) {
        this.subscribers = new Set();
        this.server = setup(null, {
            target: options && options.target || null
        });
        this.server.on('proxyReq', (proxyReq, req, res) => __awaiter(this, void 0, void 0, function* () {
            let { proxyRes, reqBody, resBody } = yield getData(proxyReq, req);
            this.subscribers.forEach(subscriber => subscriber.next({ req, proxyRes, reqBody, resBody }));
        }));
    }
    listen(port, host) {
        this.server.listen(port, host);
        return this;
    }
    filter(filter) {
        return new Filter(this, { filter });
    }
    converter(convert) {
        return new Converter(this, { convert });
    }
    subscribe(fn) {
        let subscriber;
        let next = (pack) => {
            fn(pack);
        };
        let unsubscribe = () => {
            this.subscribers.delete(subscriber);
        };
        subscriber = new RecordSubscriber(next, unsubscribe);
        this.subscribers.add(subscriber);
        return subscriber;
    }
    subscribeToStore(options) {
        let closure = (fn) => {
            return this.subscribe((pack) => {
                fn(pack);
            });
        };
        return new RecordStore(closure, options);
    }
}
class RecordObservable {
    get level() { return this.source.level + 1; }
    filter(filter) {
        return new Filter(this, { filter });
    }
    converter(convert) {
        return new Converter(this, { convert });
    }
    subscribeToStore(options) {
        let closure = (fn) => {
            return this.subscribe((pack) => {
                fn(pack);
            });
        };
        return new RecordStore(closure, options);
    }
    constructor(source) {
        this.source = source;
    }
    subscribe(fn) {
        return this.source.subscribe(this.closure(fn));
    }
}
class Filter extends RecordObservable {
    constructor(source, options) {
        super(source);
        this.closure = (fn) => {
            return (pack) => {
                if (options.filter(pack)) {
                    fn(buildNewPack(pack));
                }
            };
        };
    }
}
class Converter extends RecordObservable {
    constructor(source, options) {
        super(source);
        this.closure = (fn) => {
            return (pack) => {
                fn(options.convert(buildNewPack(pack)));
            };
        };
    }
}
class RecordStore {
    constructor(closure, options) {
        options = options || { maxCount: 10 };
        this.subscriber = closure((pack) => this.pushRecord(pack));
        this.maxCount = options.maxCount;
        this.records = [];
    }
    pushRecord(pack) {
        if (this.records.length >= this.maxCount) {
            this.records.shift();
        }
        this.records.push(pack);
    }
    get current() {
        return this.records.length > 0 ? this.records[this.records.length - 1] : null;
    }
    get size() {
        return this.records.length;
    }
    clear() {
        this.records.length = 0;
    }
    select(filter) {
        return filter ? this.records.filter(filter) : this.records.map(e => e);
    }
    destroy() {
        this.subscriber.unsubscribe();
        this.records.length = 0;
    }
}
class RecordSubscriber {
    constructor(next, unsubscribe) {
        this._close = false;
        this._next = next;
        this._unsubscribe = unsubscribe;
    }
    next(...args) {
        this._next(...args);
    }
    get close() {
        return this._close;
    }
    unsubscribe() {
        this._unsubscribe();
        this._close = true;
    }
}
exports.default = ProxyServer;

//# sourceMappingURL=main.js.map
