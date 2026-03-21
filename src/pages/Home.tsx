import { useState } from 'react';
import MonacoEditor from '@/components/editor/MonacoEditor';

export default function Home() {
  const [code, setCode] = useState<string>(
    `function hello(name: string) {\n  return "Hello, " + name;\n}\n\nconsole.log(hello("GoPilot"));\n`,
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="mt-1 text-sm text-gray-600">Monaco editor preview</p>
        </div>

        <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
          <MonacoEditor value={code} onChange={setCode} language="typescript" height="70vh" />
        </div>
      </div>
    </div>
  );
}
