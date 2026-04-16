import axios from "axios";

/*
  Base client config for your application.
  Here you can define your base url, headers,
  timeouts and middleware used for each request.
*/
const internalClient = axios.create({
  baseURL: "/",
  timeout: 500000,
  headers: {
    "content-type": "application/json",
  },
});

// Custom middleware for requests (this one just logs the error).
internalClient.interceptors.request.use(
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

export default internalClient;
