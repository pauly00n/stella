import { Chatbox } from '@/components/chatbox';

export default function StellaPage() {
  return (
    <div className="flex items-start justify-center px-4 py-12 h-full min-h-screen">
      <div className="w-full max-w-2xl flex flex-col" style={{ marginTop: 'calc(50vh - 150px)' }}>
        <Chatbox />
        <p className="text-xs text-muted-foreground text-center mt-2">
          NOT for clinical use. Educational discussion only. Stanford MSK AI 2025 / Do, Yoon, Beaulieu.
        </p>
      </div>
    </div>
  );
}