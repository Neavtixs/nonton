"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const ApiUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [file, setFile] = useState<FileList | null>(null);

  const getPresignUrl = async () => {
    console.table(file);

    if (file) {
      for (var i = 0; i < file.length; i++) {
        const data = await fetch(`${ApiUrl}/api/upload`, {
          method: "POST",
          body: JSON.stringify({
            filename: file[i].webkitRelativePath,
            content_type: file[i].type,
          }),
        })
          .then((resp) => resp.json())
          .then((res) => res.data);

        await fetch(data, {
          method: "PUT",
          headers: {
            "Content-Type": file[i].type,
          },
          body: file[i],
        }).then((resp) => console.log(i, resp.ok));
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
            //multiple
            {...({ webkitdirectory: "", directory: "" } as any)}
            onChange={(e) => setFile(e.target.files)}
          />
        </Field>
      </div>
      <Button onClick={getPresignUrl}>GET URL</Button>
      <Button onClick={getFile}>GET FILE</Button>
    </div>
  );
}
