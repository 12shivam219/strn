"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSender = startSender;
var mediasoupClient = require("mediasoup-client");
var socket_io_client_1 = require("socket.io-client");
var SIGNALING_URL = 'http://localhost:3000'; // Replace with actual server
var device = new mediasoupClient.Device();
var socket = (0, socket_io_client_1.io)(SIGNALING_URL);
function startSender(videoStream, audioStream) {
    return __awaiter(this, void 0, void 0, function () {
        var combinedStream, rtpCapabilities, transportData, transport, videoTrack, audioTrack;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    combinedStream = new MediaStream(__spreadArray(__spreadArray([], videoStream.getVideoTracks(), true), audioStream.getAudioTracks(), true));
                    // Connect to signaling - fix: don't expect parameters from 'connect' event
                    return [4 /*yield*/, new Promise(function (resolve) { return socket.on('connect', function () { return resolve(); }); })];
                case 1:
                    // Connect to signaling - fix: don't expect parameters from 'connect' event
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) {
                            return socket.emit('getRtpCapabilities', function (data) { return resolve(data); });
                        })];
                case 2:
                    rtpCapabilities = _a.sent();
                    return [4 /*yield*/, device.load({ routerRtpCapabilities: rtpCapabilities })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) {
                            return socket.emit('createProducerTransport', function (data) { return resolve(data); });
                        })];
                case 4:
                    transportData = _a.sent();
                    transport = device.createSendTransport(transportData);
                    // Signal events
                    transport.on('connect', function (_a, callback) {
                        var dtlsParameters = _a.dtlsParameters;
                        socket.emit('connectTransport', { dtlsParameters: dtlsParameters }, callback);
                    });
                    transport.on('produce', function (_a, callback) {
                        var kind = _a.kind, rtpParameters = _a.rtpParameters;
                        socket.emit('produce', { kind: kind, rtpParameters: rtpParameters }, callback);
                    });
                    videoTrack = combinedStream.getVideoTracks()[0];
                    if (!videoTrack) return [3 /*break*/, 6];
                    return [4 /*yield*/, transport.produce({ track: videoTrack })];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    audioTrack = combinedStream.getAudioTracks()[0];
                    if (!audioTrack) return [3 /*break*/, 8];
                    return [4 /*yield*/, transport.produce({ track: audioTrack })];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8:
                    console.log('✅ AV streaming started.');
                    return [2 /*return*/];
            }
        });
    });
}
