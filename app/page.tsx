import Chat from "@/components/Chat";

export default function Home() {
  return (
    <main className="page">
      <header className="header">
        <h1>What Would Lee Kuan Yew Do?</h1>
        <p className="tagline">
          A retrieval-grounded AI emulation of Singapore&apos;s founding Prime Minister.
        </p>
        <div className="disclaimer">
          <strong>Disclaimer:</strong> This is an <strong>AI emulation</strong> for educational and
          exploratory purposes — not the real Lee Kuan Yew and not an authoritative historical
          source. Answers are grounded in retrieved passages from his published speeches, memoirs,
          and interviews; where the sources don&apos;t cover a question, the model extends his
          documented reasoning and labels it as inference.
        </div>
      </header>

      <Chat />

      <footer className="footer">
        Built with retrieval-augmented generation · sources are shown behind each answer ·
        verify quotations against primary archives before citing them.
      </footer>
    </main>
  );
}
