"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectDir = projectDir;
exports.sourceFile = sourceFile;
exports.statusFile = statusFile;
exports.probeFile = probeFile;
exports.scenesFile = scenesFile;
exports.framesManifest = framesManifest;
exports.framesMd = framesMd;
exports.snippetFile = snippetFile;
exports.sceneDir = sceneDir;
exports.segDir = segDir;
exports.previewsDir = previewsDir;
exports.scenePreviewFile = scenePreviewFile;
exports.tmpDir = tmpDir;
exports.ensureDir = ensureDir;
const path_1 = __importDefault(require("path"));
const promises_1 = require("fs/promises");
const DATA_ROOT = path_1.default.join(process.cwd(), "data", "projects");
function projectDir(id) {
    return path_1.default.join(DATA_ROOT, id);
}
function sourceFile(id, ext = "mp4") {
    return path_1.default.join(projectDir(id), `source.${ext}`);
}
function statusFile(id) {
    return path_1.default.join(projectDir(id), "status.json");
}
function probeFile(id) {
    return path_1.default.join(projectDir(id), "probe.json");
}
function scenesFile(id) {
    return path_1.default.join(projectDir(id), "scenes.json");
}
function framesManifest(id) {
    return path_1.default.join(projectDir(id), "frames.json");
}
function framesMd(id) {
    return path_1.default.join(projectDir(id), "frames.md");
}
function snippetFile(id) {
    return path_1.default.join(projectDir(id), "snippet.txt");
}
function sceneDir(id, sceneIdx) {
    return path_1.default.join(projectDir(id), "frames", `scene_${String(sceneIdx).padStart(3, "0")}`);
}
function segDir(id, sceneIdx, segIdx) {
    return path_1.default.join(sceneDir(id, sceneIdx), `seg_${String(segIdx).padStart(3, "0")}`);
}
function previewsDir(id) {
    return path_1.default.join(projectDir(id), "scenes");
}
function scenePreviewFile(id, sceneIdx) {
    return path_1.default.join(previewsDir(id), `scene_${String(sceneIdx).padStart(3, "0")}_preview.jpg`);
}
function tmpDir(id) {
    return path_1.default.join(projectDir(id), "tmp");
}
async function ensureDir(dirPath) {
    await (0, promises_1.mkdir)(dirPath, { recursive: true });
}
