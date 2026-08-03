interface VirtualButtonProps {
  id: string; 
  label: React.ReactNode; 
  className?: string; 
  highlightClass?: string;
  hoveredButtonId: string | null; 
  hoverProgress: number; 
  onClick?: (id: string) => void;
}

export default function VirtualButton({ 
  id, 
  label, 
  className = "", 
  highlightClass = "bg-white/40 border-white text-white", 
  hoveredButtonId, 
  hoverProgress, 
  onClick 
}: VirtualButtonProps) {
  const isHovered = hoveredButtonId === id;
  return (
    <div 
      data-btn-id={id} 
      onClick={() => onClick && onClick(id)} 
      className={`relative border-4 flex flex-col items-center justify-center rounded-3xl transition-all duration-100 ease-out shadow-lg cursor-pointer pointer-events-auto ${isHovered ? `${highlightClass} scale-105 text-white` : "bg-slate-800/80 border-slate-600 text-slate-200"} ${className}`}
    >
      <div className="text-3xl font-black z-10 pointer-events-none text-center">{label}</div>
      {isHovered && (
        <div className="absolute bottom-2 left-4 right-4 h-2 bg-black/50 rounded-full overflow-hidden z-0">
          <div className="bg-emerald-400 h-full transition-all duration-75" style={{ width: `${hoverProgress}%` }}></div>
        </div>
      )}
    </div>
  );
}