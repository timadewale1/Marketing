import React from 'react';
import { Suspense } from 'react';
import ClientCallback from './ClientCallback';

interface Props {
  params: Promise<{ [key: string]: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page(props: Props) {
  await props.params; // Wait for params to be ready
  const searchParams = await props.searchParams;
  const reference = typeof searchParams?.reference === 'string' 
    ? searchParams.reference 
    : undefined;
  return (
    <Suspense>
      <ClientCallback reference={reference} />
    </Suspense>
  );
}
