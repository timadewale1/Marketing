import React, { Suspense } from 'react';
import ClientCallback from './ClientCallback';

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-lg w-full p-8 bg-white rounded-lg shadow text-center">
          <p>Loading...</p>
        </div>
      </div>
    }>
      <ClientCallback />
    </Suspense>
  );
}
