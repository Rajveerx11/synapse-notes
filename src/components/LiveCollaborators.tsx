"use client";
import { CollaboratorPeer } from "@/lib/collaboration";
import styles from "./LiveCollaborators.module.css";

interface Props {
  peers: CollaboratorPeer[];
  currentClientId: string;
}

export default function LiveCollaborators({ peers, currentClientId }: Props) {
  const otherPeers = peers.filter((p) => p.clientId !== currentClientId);

  return (
    <div className={styles.container} title={`${peers.length} active collaborator${peers.length === 1 ? "" : "s"}`}>
      <div className={styles.liveDot} />
      <span className={styles.countText}>
        {peers.length} online
      </span>
      <div className={styles.avatarStack}>
        {peers.slice(0, 4).map((p) => {
          const isSelf = p.clientId === currentClientId;
          const initial = p.username.charAt(0).toUpperCase();
          return (
            <div
              key={p.clientId}
              className={`${styles.avatar} ${isSelf ? styles.selfAvatar : ""}`}
              style={{ backgroundColor: p.color }}
              title={`${p.username}${isSelf ? " (You)" : ""}`}
            >
              {initial}
            </div>
          );
        })}
        {peers.length > 4 && (
          <div className={styles.overflowBadge}>
            +{peers.length - 4}
          </div>
        )}
      </div>
    </div>
  );
}
