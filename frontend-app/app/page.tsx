"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { useState } from "react";

const ApiUrl = process.env.NEXT_PUBLIC_API_URL;

interface FileRequest {
  filename: string;
  content_type: string;
}

interface PresignRequest {
  files: FileRequest[];
}

interface PresignFileResponse {
  key: string;
  upload_url: string;
}
export default function Home() {
  const [file, setFile] = useState<FileList | null>(null);
  const [progress, setProgress] = useState(0);

  const getPresignUrl = async () => {
    if (!file) return;

    const files = Array.from(file);
    const totalFiles = files.length;
    let uploadedFiles = 0;

    for (let i = 0; i < files.length; i += 100) {
      const batch = files.slice(i, i + 100);
      const req: PresignRequest = {
        files: batch.map((item) => {
          return {
            filename: item.webkitRelativePath,
            content_type: item.type,
          };
        }),
      };

      const urls: PresignFileResponse[] = await fetch(`${ApiUrl}/api/upload`, {
        method: "POST",
        body: JSON.stringify(req),
      })
        .then((resp) => resp.json())
        .then((res) => res.data);

      console.log(i);
      const CONCURRENCY = 5;
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const uploadBatch = batch.slice(i, i + CONCURRENCY);
        const uploadUrls = urls.slice(i, i + CONCURRENCY);

        await Promise.all(
          uploadBatch.map((file, index) =>
            fetch(uploadUrls[index].upload_url, {
              method: "PUT",
              headers: {
                "Content-Type": file.type,
              },
              body: file,
            }).then(() => {
              uploadedFiles++;
              const progresses = (uploadedFiles / totalFiles) * 100;
              setProgress(progresses);
            }),
          ),
        );
      }
    }
  };

  const getFile = async () => {
    const data = await fetch(`${ApiUrl}/api/file`, {
      method: "GET",
    })
      .then((resp) => resp.json())
      .then((res) => res.data);

    console.log(data);
  };

  return (
    <div className="p-3">
      <div>
        <Field>
          <FieldLabel>Select Movie</FieldLabel>
          <Input
            type="file"
            multiple
            {...({ webkitdirectory: "", directory: "" } as any)}
            onChange={(e) => setFile(e.target.files)}
          />
        </Field>
      </div>
      <Progress value={progress} className={"mb-4"}>
        <ProgressLabel>Uplod Movie</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Button onClick={getPresignUrl}>UPLOAD</Button>
      <Button onClick={getFile}>GET FILE</Button>
    </div>
  );
}
