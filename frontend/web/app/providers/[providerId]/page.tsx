export function generateStaticParams() {
  return [{ providerId: "placeholder" }];
}

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  return (
    <main>
      <h1>Provider {providerId}</h1>
    </main>
  );
}
