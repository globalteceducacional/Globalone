declare module 'occt-import-js' {
  type OcctInitOptions = {
    locateFile?: (path: string) => string;
  };

  export default function occtimportjs(options?: OcctInitOptions): Promise<unknown>;
}

declare module 'occt-import-js/dist/occt-import-js.wasm?url' {
  const url: string;
  export default url;
}
