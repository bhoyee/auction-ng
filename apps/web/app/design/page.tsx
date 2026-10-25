import { notFound } from 'next/navigation';
import { DesignPreview } from './preview';

export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignPreview />;
}
