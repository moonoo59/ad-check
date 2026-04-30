import ConfirmDialog from '../ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RequestActionDialogsProps {
  detailStatus: string;
  approveConfirmOpen: boolean;
  retryConfirmOpen: boolean;
  retryCopyConfirmOpen: boolean;
  deleteConfirmOpen: boolean;
  rejectModalOpen: boolean;
  rejectReason: string;
  resendModalOpen: boolean;
  resendReason: string;
  onApproveCancel: () => void;
  onApproveConfirm: () => void;
  onRetryCancel: () => void;
  onRetryConfirm: () => void;
  onRetryCopyCancel: () => void;
  onRetryCopyConfirm: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onRejectOpenChange: (open: boolean) => void;
  onRejectReasonChange: (value: string) => void;
  onRejectConfirm: () => void;
  onResendOpenChange: (open: boolean) => void;
  onResendReasonChange: (value: string) => void;
  onResendConfirm: () => void;
}

export default function RequestActionDialogs({
  detailStatus,
  approveConfirmOpen,
  retryConfirmOpen,
  retryCopyConfirmOpen,
  deleteConfirmOpen,
  rejectModalOpen,
  rejectReason,
  resendModalOpen,
  resendReason,
  onApproveCancel,
  onApproveConfirm,
  onRetryCancel,
  onRetryConfirm,
  onRetryCopyCancel,
  onRetryCopyConfirm,
  onDeleteCancel,
  onDeleteConfirm,
  onRejectOpenChange,
  onRejectReasonChange,
  onRejectConfirm,
  onResendOpenChange,
  onResendReasonChange,
  onResendConfirm,
}: RequestActionDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={approveConfirmOpen}
        title="선택된 항목 승인 복사"
        message="선택된 파일을 로컬 스토리지로 복사합니다. 이 작업은 취소할 수 없습니다. 계속하시겠습니까?"
        confirmLabel="승인 및 복사"
        onConfirm={onApproveConfirm}
        onCancel={onApproveCancel}
      />

      <ConfirmDialog
        open={retryConfirmOpen}
        title="탐색 재시도"
        message="기존 탐색 결과가 초기화됩니다. 탐색을 재실행하시겠습니까?"
        confirmLabel="재시도"
        onConfirm={onRetryConfirm}
        onCancel={onRetryCancel}
      />

      <ConfirmDialog
        open={retryCopyConfirmOpen}
        title={detailStatus === 'editing' ? '수정 항목 복사 실행' : '복사 재시도'}
        message={
          detailStatus === 'editing'
            ? '수정 중인 항목만 다시 복사합니다. 계속하시겠습니까?'
            : '실패한 항목만 다시 복사합니다. 계속하시겠습니까?'
        }
        confirmLabel="복사 실행"
        onConfirm={onRetryCopyConfirm}
        onCancel={onRetryCopyCancel}
      />



      <ConfirmDialog
        open={deleteConfirmOpen}
        title="요청 삭제"
        message="이 요청을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
        confirmLabel="삭제"
        confirmVariant="red"
        onConfirm={onDeleteConfirm}
        onCancel={onDeleteCancel}
      />

      <Dialog open={rejectModalOpen} onOpenChange={onRejectOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <p className="app-eyebrow">Review</p>
            <DialogTitle>반려 사유 입력</DialogTitle>
            <DialogDescription>
              반려 사유는 요청 상세와 감사 로그에 함께 기록됩니다.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(event) => onRejectReasonChange(event.target.value)}
            rows={4}
            className="app-textarea"
            placeholder="반려 사유를 입력하세요. (최소 5자)"
            aria-label="반려 사유"
          />
          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => onRejectOpenChange(false)}
              className="app-btn app-btn--secondary"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onRejectConfirm}
              className="app-btn app-btn--danger"
            >
              반려 처리
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resendModalOpen} onOpenChange={onResendOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <p className="app-eyebrow">Resend</p>
            <DialogTitle>재전송 사유 입력</DialogTitle>
            <DialogDescription>
              재전송 요청은 완료 이력과 함께 기록되며, 이후 관리자 또는 광고팀이 다시 복사를 실행합니다.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={resendReason}
            onChange={(event) => onResendReasonChange(event.target.value)}
            rows={4}
            className="app-textarea"
            placeholder="재전송 사유를 입력하세요. (최소 5자)"
            aria-label="재전송 사유"
          />
          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => onResendOpenChange(false)}
              className="app-btn app-btn--secondary"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onResendConfirm}
              className="app-btn app-btn--primary"
            >
              재전송 요청
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
