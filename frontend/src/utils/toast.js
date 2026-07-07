import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export function toastify(message, type) {
    const object = {
        theme: "colored",
    }
    if (type === 'success') {
        toast.success(message, object);
    }
    if (type === 'info') {
        toast.info(message, object);
    }
    if (type === 'warn') {
        toast.warn(message, object);
    }
    if (type === 'error') {
        toast.error(message, object);
    }
    if (type === 'default') {
        toast(message, object);
    }
}
