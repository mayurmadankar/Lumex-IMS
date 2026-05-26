import TransferRequestList from "@/components/transfer/TransferRequestList";

export default function MyTransferRequestsPage() {
  return (
    <TransferRequestList
      mode="outgoing"
      title="My Requests"
      subtitle="Company stock requests created by you"
    />
  );
}
