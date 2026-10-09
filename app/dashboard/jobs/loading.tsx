export default function JobsLoading() {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]" aria-busy="true" aria-label="Loading jobs">
      <div className="min-h-screen lg:pl-[250px]">
        <div className="h-[68px] border-b border-[#e8ebe6] bg-white" />
        <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="h-3 w-36 animate-pulse rounded bg-[#e5e9e3]" />
          <div className="mt-3 h-9 w-64 max-w-full animate-pulse rounded bg-[#e5e9e3]" />
          <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-[#e5e9e3]" />
          <div className="mt-7 h-24 animate-pulse rounded-xl bg-white ring-1 ring-[#e8ebe6]" />
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-white ring-1 ring-[#e8ebe6]" />)}
          </div>
        </main>
      </div>
    </div>
  );
}
