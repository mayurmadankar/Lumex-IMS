import TransferRequestList from "@/components/transfer/TransferRequestList";

export default function IncomingTransferRequestsPage() {
  return (
    <TransferRequestList
      mode="incoming"
      title="Incoming Requests"
      subtitle="Requests sent to companies you can manage"
    />
  );
}
