import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCustomers } from "@/hooks/segmentation";

export function GlobalSearch() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const handleSearch = (value: string) => {
    setSearch(value);
    if (value.length > 2) {
      navigate(`/customers?search=${encodeURIComponent(value)}`);
    }
  };

  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search customers..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
