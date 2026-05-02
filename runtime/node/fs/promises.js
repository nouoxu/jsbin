import fs from "../fs.js";

function resolveValue(value) {
    return Promise.resolve(value);
}

function rejectError(error) {
    return Promise.reject(error);
}

function writeFile(pathValue, data, enc) {
    try {
        return resolveValue(fs.writeFileSync(pathValue, data, enc));
    } catch (error) {
        return rejectError(error);
    }
}

function readFile(pathValue, enc) {
    try {
        return resolveValue(fs.readFileSync(pathValue, enc));
    } catch (error) {
        return rejectError(error);
    }
}

function appendFile(pathValue, data, enc) {
    try {
        return resolveValue(fs.appendFileSync(pathValue, data, enc));
    } catch (error) {
        return rejectError(error);
    }
}

function access(pathValue, mode) {
    try {
        return resolveValue(fs.accessSync(pathValue, mode));
    } catch (error) {
        return rejectError(error);
    }
}

function mkdir(pathValue, options) {
    try {
        return resolveValue(fs.mkdirSync(pathValue, options));
    } catch (error) {
        return rejectError(error);
    }
}

function readdir(pathValue, options) {
    try {
        return resolveValue(fs.readdirSync(pathValue, options));
    } catch (error) {
        return rejectError(error);
    }
}

function stat(pathValue) {
    try {
        return resolveValue(fs.statSync(pathValue));
    } catch (error) {
        return rejectError(error);
    }
}

function lstat(pathValue) {
    try {
        return resolveValue(fs.lstatSync(pathValue));
    } catch (error) {
        return rejectError(error);
    }
}

function unlink(pathValue) {
    try {
        return resolveValue(fs.unlinkSync(pathValue));
    } catch (error) {
        return rejectError(error);
    }
}

const promises = {
    writeFile,
    readFile,
    appendFile,
    access,
    mkdir,
    readdir,
    stat,
    lstat,
    unlink,
};

export {
    writeFile,
    readFile,
    appendFile,
    access,
    mkdir,
    readdir,
    stat,
    lstat,
    unlink
};

export default promises;
