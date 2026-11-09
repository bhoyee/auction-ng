import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import Encoder from 'qrcode/lib/core/qrcode';
import { mobileTheme as theme } from '@auction-ng/ui';
// Only the numeric module matrix reaches the SVG renderer. Secrets stay on device.
export function PrivateQr({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(
    () => Encoder.create(value, { errorCorrectionLevel: 'M' }).modules,
    [value],
  );
  const quiet = 4,
    size = matrix.size + quiet * 2;
  const path: string[] = [];
  for (let row = 0; row < matrix.size; row++)
    for (let column = 0; column < matrix.size; column++)
      if (matrix.get(row, column))
        path.push(`M${column + quiet} ${row + quiet}h1v1h-1z`);
  return (
    <Svg
      width={216}
      height={216}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <Rect width={size} height={size} fill={theme.colors.surface} />
      <Path d={path.join('')} fill={theme.colors.ink} />
    </Svg>
  );
}
