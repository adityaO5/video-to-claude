"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiGet = apiGet;
exports.apiPost = apiPost;
exports.apiPostFormData = apiPostFormData;
exports.apiGetText = apiGetText;
exports.apiGetBinary = apiGetBinary;
const BASE_URL = process.env.VIDEO_TO_CLAUDE_URL ?? "http://localhost:3000";
async function apiGet(path) {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok)
        throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
}
async function apiPost(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
}
async function apiPostFormData(path, form) {
    const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: form });
    if (!res.ok)
        throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
}
async function apiGetText(path) {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok)
        throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.text();
}
async function apiGetBinary(path) {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok)
        throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.arrayBuffer();
}
