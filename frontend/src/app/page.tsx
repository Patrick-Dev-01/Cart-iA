"use client"
import { getCatalog } from "@/api";
import { Input } from "@/components/ui/input";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

export default function Home() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  const products = useSWR(`/api/catalog?e=${search}`, async () => getCatalog(search));
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    window.history.pushState({}, '', `?search=${e.target.value}`)
  }
  
  return (
    
    <div className="my-10">
      <Input onChange={(e) => handleSearch(e)}/>
      {
        products.data?.map(product => (
          <div key={product.id} className="p-4 border-b">
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <p className="text-green-600">R$ {(product.price / 100).toFixed(2)}</p>
          </div>
        ))
      }
    </div>
  );
}
