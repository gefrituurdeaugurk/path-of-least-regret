import * as API from './api.js';
// Attach to window for non-module usage
if (typeof window !== 'undefined') {
    window.NavMeshPF = API;
}
