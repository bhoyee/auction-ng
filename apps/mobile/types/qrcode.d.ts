declare module 'qrcode/lib/core/qrcode' {
  const encoder: {
    create(
      value: string,
      options: { errorCorrectionLevel: 'M' },
    ): {
      modules: {
        size: number;
        get(row: number, column: number): boolean | number;
      };
    };
  };
  export default encoder;
}
