export function generateStaticParams() {
  return [{ conversationId: "placeholder" }];
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <main>
      <h1>Conversation {conversationId}</h1>
    </main>
  );
}
