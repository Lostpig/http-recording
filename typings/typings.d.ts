// Type definitions for http-recording v0.1.0
// Project: https://github.com/Lostpig/http-recording
// Definitions by: Lostpig <https://github.com/Lostpig/>

import * as url from 'url'
import * as EventEmitter from 'events'
import * as http from 'http'
import { Buffer } from 'buffer'

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
 } from '../src/interface'
