import localforage from 'localforage';

export async function getItem(key) {
    try {
        const item = await localforage.getItem(key);
        try {
            return JSON.parse(item);
        } catch {
            return item; // Return the raw value if it's not JSON
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

export async function setItem(key, value) {
    try {
        await localforage.setItem(key, value);
        return `Item with key "${key}" set successfully.`;
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

export async function removeItem(key) {
    try {
        await localforage.removeItem(key);
        return `Item with key "${key}" removed successfully.`;
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

export async function clearStorage() {
    try {
        await localforage.clear();
        return 'All items cleared successfully.';
    } catch (error) {
        return `Error: ${error.message}`;
    }
}
