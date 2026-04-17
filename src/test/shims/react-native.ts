/** 供 Vitest 在 Node 下解析依赖树时占位，避免加载带 Flow 的 react-native 主入口。 */
export const Platform = {
  OS: "ios" as const,
  Version: 42,
  select<T>(spec: { ios?: T; android?: T; default?: T }): T | undefined {
    return spec.ios ?? spec.default;
  }
};

const stub = { Platform };
export default stub;
