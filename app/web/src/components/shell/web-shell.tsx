"use client";

import { useState } from "react";
import { useConversation } from "../../hooks/use-conversation";
import { useIntegrations } from "../../hooks/use-integrations";
import { Sidebar } from "./sidebar";
import { ChatView } from "../chat/chat-view";
import { IntegrationDialog } from "../integration/integration-dialog";
import styles from "./shell.module.css";

export function WebShell() {
  const conversation = useConversation();
  const integrations = useIntegrations();
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  const handleNewChat = () => {
    conversation.reset();
  };

  const handleSend = async (message: string) => {
    if (!message.trim()) return {} as any;
    if (!conversation.current) {
      return conversation.start(message);
    } else {
      return conversation.addTurn(message);
    }
  };

  return (
    <div className={styles.shell}>
      <Sidebar
        sessions={conversation.sessions}
        integrations={integrations.integrations}
        currentId={conversation.current?.conversation_id}
        onNewChat={handleNewChat}
        onSelectSession={(id) => conversation.load(id)}
        onOpenIntegrations={() => setIntegrationsOpen(true)}
      />
      <main className={styles.main}>
        <ChatView
          current={conversation.current}
          busy={conversation.busy}
          onSend={handleSend}
          onToggleFixedIntent={(enabled) =>
            conversation.setFixedIntent(enabled)
          }
        />
      </main>
      {integrationsOpen && (
        <IntegrationDialog
          integrations={integrations.integrations}
          busy={integrations.busy}
          onInstall={integrations.install}
          onConfigure={integrations.configure}
          onTest={integrations.test}
          onEnable={integrations.enable}
          onDisable={integrations.disable}
          onClose={() => setIntegrationsOpen(false)}
        />
      )}
    </div>
  );
}
