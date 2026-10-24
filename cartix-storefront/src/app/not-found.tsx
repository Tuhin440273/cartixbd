import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState level={1} title="Page not found" text="The page you are looking for does not exist or is no longer available." action={{ href: '/', label: 'Go to the home page' }} />
    </div>
  );
}
