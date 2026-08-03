export default function SignageNextRoom() {
  return (
    <div className="flex h-dvh w-screen flex-col items-center justify-center bg-black text-white">
      <div className="mb-10 h-1 w-48 rounded-full bg-purple-500 shadow-[0_0_32px_rgba(168,85,247,0.9)]" />
      <p className="mb-8 text-2xl font-black uppercase tracking-[0.45em] text-purple-300">MISSION CLEAR</p>
      <h1 className="text-center text-6xl font-black leading-tight tracking-normal md:text-8xl">
        次の部屋へ
        <br />
        お進みください
      </h1>
      <p className="mt-10 text-xl font-bold tracking-[0.25em] text-slate-400">PLEASE PROCEED TO THE NEXT ROOM</p>
    </div>
  );
}
