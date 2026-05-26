import TransferRequestList from "@/components/transfer/TransferRequestList";

export default function TransferRequestsPage() {
  return (
    <TransferRequestList
      mode="all"
      title="Transfer Requests"
      subtitle="Incoming and outgoing company item requests"
    />
  );
}
