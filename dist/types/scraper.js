"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertProfileForOpenAI = convertProfileForOpenAI;
function convertProfileForOpenAI(profile) {
    var _a, _b, _c, _d;
    return Object.assign(Object.assign({}, profile), { followersCount: (_b = (_a = profile.followersCount) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : null, followingCount: (_d = (_c = profile.followingCount) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : null });
}
