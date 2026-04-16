import axios from "axios";

/*
  Base client config for your application.
  Here you can define your base url, headers,
  timeouts and middleware used for each request.
*/
const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL!,
  timeout: 20000,
  headers: {
    "content-type": "application/json",
  },
});

// Custom middleware for requests (this one just logs the error).
client.interceptors.request.use(
  async (config) => {
    const token = window.localStorage.getItem("token");
    config.headers.authorization = `Bearer ${token}`;
    return config;
  },
  (error) => {
    console.error(error);
    return Promise.reject(error);
  },
);

export default client;
