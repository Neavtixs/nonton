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
export default function UploadPage() {
  const [file, setFile] = useState<FileList | null>(null);
  const [progress, setProgress] = useState(0);

  const getPresignUrl = async () => {
    if (!file) return;

    const files = Array.from(file);
    let uploadedFiles = 0;

    for (let batchIndex = 0; batchIndex < files.length; batchIndex += 100) {
      const batch = files.slice(batchIndex, batchIndex + 100);
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
        .catch(() => {
          throw new Error("Failed to generate presigned URLs");
        })
        .then((res) => res.data);

      // CONCURRENT UPLOAD
      let current = 0;
      const worker = async () => {
        while (current < batch.length) {
          const index = current++;

          await fetch(urls[index].upload_url, {
            method: "PUT",
            headers: {
              "Content-Type": batch[index].type,
            },
            body: batch[index],
          });
          uploadedFiles++;
          setProgress((uploadedFiles / files.length) * 100);
        }
      };

      await Promise.all(Array.from({ length: 8 }, () => worker()));
    }
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
    </div>
  );
}
