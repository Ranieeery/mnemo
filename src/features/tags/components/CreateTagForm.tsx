import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, Input } from "../../../shared/ui";
import { useCreateTag } from "../queries";

/** Creates a tag ahead of time, so it is offered as a suggestion when tagging videos. */
export function CreateTagForm() {
    const createTag = useCreateTag();
    const [name, setName] = useState("");

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (name.trim()) {
            createTag.mutate(name, { onSuccess: () => setName("") });
        }
    };

    return (
        <form onSubmit={submit} className="flex items-end gap-2">
            <Input
                label="New tag"
                hideLabel
                placeholder="New tag"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="max-w-xs flex-1"
            />
            <Button type="submit" icon={<Plus />} loading={createTag.isPending} disabled={!name.trim()}>
                Create tag
            </Button>
        </form>
    );
}
