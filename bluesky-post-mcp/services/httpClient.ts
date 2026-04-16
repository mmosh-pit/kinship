import axios from "axios";
import { config } from "../config/config";

export const client = (token: string) => {
    const client = axios.create({
        baseURL: config.nextPublicBackendUrl,
        timeout: 20000,
        headers: {
            "content-type": "application/json",
        },
    });

    client.interceptors.request.use(
        async (config) => {
            config.headers.authorization = `Bearer ${token}`;
            return config;
        },
        (error) => {
            console.error(error);
            return Promise.reject(error);
        },
    );
    return client;
}