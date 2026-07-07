// Runtime config. Valores por defecto (vacios) para dev.
// En el contenedor, el entrypoint lo regenera con las env del pod (Secret/ConfigMap).
window.__ENV__ = {
  VITE_API_BASE_URL: "",
  VITE_API_PORT: "",
};
