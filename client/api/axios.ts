import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const persistedRoot = localStorage.getItem("persist:ims-root");

      if (persistedRoot) {
        try {
          const parsedRoot = JSON.parse(persistedRoot);
          const auth = parsedRoot.auth ? JSON.parse(parsedRoot.auth) : null;
          const token = auth?.accessToken;

          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch (error) {
          console.error("Failed to read persisted auth token:", error);
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.error("Unauthorized request, redirecting to login...");
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        localStorage.removeItem("persist:ims-root");
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
