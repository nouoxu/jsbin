// Debug version of _object_get that prints the key
export function object_get_debug(obj, key) {
    console.log("object_get called with obj=" + obj + " key=" + key);
    if (obj === 0) {
        console.log("  obj is NULL!");
        return 0;
    }
    // Simplified: just try to get "platform" property
    // This would need the actual object layout
    return 0;
}
