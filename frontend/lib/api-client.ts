export const apiUrl = (path: string) => process.env.NODE_ENV === 'development' ? `http://localhost:8788${path}` : path;
